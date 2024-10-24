<template>
  <div id="google-pay-button"></div>
</template>

<script lang="ts" setup>
import { PayPalAddToCartCallback } from '~/components/PayPal/types';
import { cartGetters, orderGetters } from '@plentymarkets/shop-api';

let countryCodeString = '';
const { getScript, executeOrder, createCreditCardTransaction, captureOrder, getOrder } = usePayPal();
const { shippingPrivacyAgreement } = useAdditionalInformation();
const { createOrder } = useMakeOrder();
const { data: cart, clearCartItems } = useCart();
const currency = computed(() => cartGetters.getCurrency(cart.value) || (useAppConfig().fallbackCurrency as string));
const paypal = await getScript(currency.value);
const localePath = useLocalePath();
const emits = defineEmits<{
  (event: 'button-clicked', callback: PayPalAddToCartCallback): Promise<void>;
}>();
const loadGooglePay = async () => {
  return new Promise((resolve, reject) => {
    const scriptElement = document.createElement('script');
    scriptElement.src = 'https://pay.google.com/gp/p/js/pay.js';
    scriptElement.type = 'text/javascript';
    scriptElement.addEventListener('load', resolve);
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    scriptElement.onerror = reject;
    document.head.append(scriptElement);
  });
};
let paymentsClient: google.payments.api.PaymentsClient | null = null,
  googlepayConfig: any = null;
async function getGooglePayConfig() {
  if (googlepayConfig === null) {
    googlepayConfig = await (paypal as any).Googlepay().config();
  }
  return googlepayConfig;
}
async function getGooglePaymentDataRequest() {
  const {
    allowedPaymentMethods,
    merchantInfo,
    apiVersion,
    apiVersionMinor,
    countryCode,
    transactionInfo,
    callbackIntents,
  } = await getGooglePayConfig();
  countryCodeString = countryCode;
  const modifiedAllowedPaymentMethods = allowedPaymentMethods.map((method: any) => ({
    ...method,
    transactionInfo: {
      ...method.transactionInfo,
      intent: 'AUTHORIZE',
    },
  }));
  const baseRequest = {
    apiVersion,
    apiVersionMinor,
    allowedPaymentMethods: modifiedAllowedPaymentMethods,
    transactionInfo,
    merchantInfo,
    callbackIntents,
  };
  const paymentDataRequest = Object.assign({}, baseRequest);
  paymentDataRequest.allowedPaymentMethods = allowedPaymentMethods;
  paymentDataRequest.transactionInfo = getGoogleTransactionInfo();
  paymentDataRequest.merchantInfo = merchantInfo;
  return paymentDataRequest;
}

function getGooglePaymentsClient() {
  if (paymentsClient === null) {
    paymentsClient = new google.payments.api.PaymentsClient({
      environment: 'TEST',
    });
  }
  return paymentsClient;
}
async function onGooglePayLoaded() {
  const paymentsClient = getGooglePaymentsClient();
  const { allowedPaymentMethods, apiVersion, apiVersionMinor } = await getGooglePayConfig();
  try {
    const response = await paymentsClient.isReadyToPay({ allowedPaymentMethods, apiVersion, apiVersionMinor });
    if (response.result) {
      addGooglePayButton();
    }
  } catch (error) {
    console.error(error);
  }
}
function addGooglePayButton() {
  const paymentsClient = getGooglePaymentsClient();
  const button = paymentsClient.createButton({
    onClick: onGooglePaymentButtonClicked,
  });
  const theContainer = document.querySelector('#google-pay-button');
  if (theContainer) {
    theContainer.append(button);
  }
}
function getGoogleTransactionInfo() {
  return {
    countryCode: countryCodeString,
    currencyCode: currency.value,
    totalPriceStatus: 'FINAL',
    totalPrice: cartGetters.getTotals(cart.value).total.toString(),
  };
}

async function onGooglePaymentButtonClicked() {
  await emits('button-clicked', async (successfully) => {
    if (successfully) {
      const paymentDataRequest = await getGooglePaymentDataRequest();
      const paymentsClient = getGooglePaymentsClient();
      paymentsClient
        .loadPaymentData(paymentDataRequest)
        // eslint-disable-next-line promise/always-return
        .then((paymentData: google.payments.api.PaymentData) => {
          processPayment(paymentData);
        })
        .catch((error) => {
          console.error(error);
        });
    }
  });
}
async function processPayment(paymentData: google.payments.api.PaymentData) {
  try {
    console.log('paymentData', paymentData);
    const transaction = await createCreditCardTransaction();
    console.log('transaction', transaction);
    if (!transaction || !transaction.id) throw new Error('Transaction creation failed.');

    let { status } = await (paypal as any).Googlepay().confirmOrder({
      orderId: transaction.id,
      paymentMethodData: paymentData.paymentMethodData,
    });
    console.log(status);
    if (status === 'PAYER_ACTION_REQUIRED') {
      // eslint-disable-next-line promise/catch-or-return
      await (paypal as any)
        .Googlepay()
        .initiatePayerAction({ orderId: transaction.id })

      const paypalOrder = await getOrder({
        paypalOrderId: transaction.id,
        payPalPayerId: transaction.payPalPayerId,
      });
      console.log('paypalOrder', paypalOrder);
      status = paypalOrder?.status || 'ERROR';
    }

    console.log('check status', status);
    if (status === "APPROVED") {
      await captureOrder({
        paypalOrderId: transaction.id,
        paypalPayerId: transaction.payPalPayerId,
      });
      const order = await createOrder({
        paymentId: cart.value.methodOfPaymentId,
        shippingPrivacyHintAccepted: shippingPrivacyAgreement.value,
      });
      if (!order || !order.order || !order.order.id) throw new Error('Order creation failed.');
      await executeOrder({
        mode: 'googlepay',
        plentyOrderId: Number.parseInt(orderGetters.getId(order)),
        paypalTransactionId: transaction.id,
      });
      clearCartItems();
      navigateTo(localePath(paths.confirmation + '/' + order.order.id + '/' + order.order.accessKey));

      return {transactionState: 'SUCCESS'};
    } else {
      return {transactionState: 'ERROR'};
    }
  } catch (error: unknown) {
    console.error('Error during payment process:', error);
    return {
      transactionState: 'ERROR',
      error: {
        message: error,
      },
    };
  }
}
onMounted(async () => {
  await loadGooglePay().then(() => {
    if (google && (paypal as any).Googlepay) {
      onGooglePayLoaded().catch(console.error);
    }
    return null;
  });
});
</script>
