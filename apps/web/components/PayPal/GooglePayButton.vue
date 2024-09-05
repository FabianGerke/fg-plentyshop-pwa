<template>
  <div class="flex items-center justify-center w-full my-2" v-if="isGooglePayLoaded">
    <div class="border-t-2 flex-grow"></div>
    <p class="px-2 text-sm uppercase text-gray-400">{{ $t('or') }}</p>
    <div class="border-t-2 flex-grow"></div>
  </div>
  <div id="google-pay-button"></div>
</template>

<script lang="ts" setup>
import { PayPalAddToCartCallback } from '~/components/PayPal/types';
import { cartGetters, orderGetters } from '@plentymarkets/shop-api';

let isGooglePayLoaded = false;
const { loadScript, executeOrder, createTransaction, captureOrder } = usePayPal();
const { shippingPrivacyAgreement } = useAdditionalInformation();
const { createOrder } = useMakeOrder();
const { data: cart, clearCartItems } = useCart();
const currency = computed(() => cartGetters.getCurrency(cart.value) || (useAppConfig().fallbackCurrency as string));
const paypal = await loadScript(currency.value);
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
/**
 * An initialized google.payments.api.PaymentsClient object or null if not yet set
 * An initialized paypal.Googlepay().config() response object or null if not yet set
 *
 * @see {@link getGooglePaymentsClient}
 */
let paymentsClient: google.payments.api.PaymentsClient | null = null,
  googlepayConfig: any = null;
/**
 *
 * @returns Fetch the Google Pay Config From PayPal
 */
async function getGooglePayConfig() {
  if (googlepayConfig === null) {
    googlepayConfig = await (paypal as any).Googlepay().config();
    console.log(' ===== Google Pay Config Fetched =====', googlepayConfig);
  }
  return googlepayConfig;
}
/**
 * Configure support for the Google Pay API
 *
 * @see {@link https://developers.google.com/pay/api/web/reference/request-objects#PaymentDataRequest|PaymentDataRequest}
 * @returns {object} PaymentDataRequest fields
 */
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
  const baseRequest = {
    apiVersion,
    apiVersionMinor,
    allowedPaymentMethods,
    transactionInfo,
    merchantInfo,
    callbackIntents,
  };
  console.log('baseRequest', baseRequest);
  const paymentDataRequest = Object.assign({}, baseRequest);
  paymentDataRequest.allowedPaymentMethods = allowedPaymentMethods;
  paymentDataRequest.transactionInfo = getGoogleTransactionInfo(countryCode);
  paymentDataRequest.merchantInfo = merchantInfo;
  paymentDataRequest.callbackIntents = ['PAYMENT_AUTHORIZATION'];
  console.log('paymentdatarequest', paymentDataRequest);
  return paymentDataRequest;
}

/**
 * Handles authorize payments callback intents.
 *
 * @param {object} paymentData response from Google Pay API after a payer approves payment through user gesture.
 * @see {@link https://developers.google.com/pay/api/web/reference/response-objects#PaymentData object reference}
 *
 * @see {@link https://developers.google.com/pay/api/web/reference/response-objects#PaymentAuthorizationResult}
 * @returns Promise<{object}> Promise of PaymentAuthorizationResult object to acknowledge the payment authorization status.
 */
function onPaymentAuthorized(paymentData: any): Promise<google.payments.api.PaymentAuthorizationResult> {
  return new Promise<google.payments.api.PaymentAuthorizationResult>((resolve) => {
    console.log('starting payment auth');
    processPayment(paymentData)
      // eslint-disable-next-line promise/always-return
      .then(() => {
        console.log('starting payment auth success');
        resolve({
          transactionState: 'SUCCESS',
        } as google.payments.api.PaymentAuthorizationResult);
      })
      .catch((error) => {
        console.log('starting payment auth failed', error.message);
        resolve({
          transactionState: 'ERROR',
          error: {
            message: error.message,
          },
        } as google.payments.api.PaymentAuthorizationResult);
      });
  });
}

function getGooglePaymentsClient() {
  if (paymentsClient === null) {
    paymentsClient = new google.payments.api.PaymentsClient({
      environment: 'TEST',
      paymentDataCallbacks: {
        onPaymentAuthorized: onPaymentAuthorized,
      },
    });
  }
  console.log('Payments client', paymentsClient);
  return paymentsClient;
}
/**
 * Initialize Google PaymentsClient after Google-hosted JavaScript has loaded
 *
 * Display a Google Pay payment button after confirmation of the viewer's
 * ability to pay.
 */
async function onGooglePayLoaded() {
  console.log('ongooglepayloaded');
  const paymentsClient = getGooglePaymentsClient();
  const { allowedPaymentMethods, apiVersion, apiVersionMinor } = await getGooglePayConfig();
  paymentsClient
    .isReadyToPay({ allowedPaymentMethods, apiVersion, apiVersionMinor })
    .then((response) => {
      console.log('is ready to pay');
      isGooglePayLoaded = true;
      if (response.result) {
        addGooglePayButton();
      }
    })
    .catch(function (error) {
      // show error in developer console for debugging
      console.error(error);
    });
}
/**
 * Add a Google Pay purchase button alongside an existing checkout button
 *
 * @see {@link https://developers.google.com/pay/api/web/reference/request-objects#ButtonOptions|Button options}
 * @see {@link https://developers.google.com/pay/api/web/guides/brand-guidelines|Google Pay brand guidelines}
 */
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
/**
 * Provide Google Pay API with a payment amount, currency, and amount status
 *
 * @see {@link https://developers.google.com/pay/api/web/reference/request-objects#TransactionInfo|TransactionInfo}
 * @returns {object} transaction info, suitable for use as transactionInfo property of PaymentDataRequest
 */
function getGoogleTransactionInfo(countryCode: any) {
  return {
    displayItems: [
      {
        label: 'Subtotal',
        type: 'SUBTOTAL',
        price: '0.09',
      },
      {
        label: 'Tax',
        type: 'TAX',
        price: '0.01',
      },
    ],
    countryCode: countryCode,
    currencyCode: 'EUR',
    totalPriceStatus: 'FINAL',
    totalPrice: '0.10',
    totalPriceLabel: 'Total',
  };
}
/**
 * Show Google Pay payment sheet when Google Pay payment button is clicked
 */
async function onGooglePaymentButtonClicked() {
  console.log('on google button clicked');
  emits('button-clicked', async (successfully) => {
    if (successfully) {
      const paymentDataRequest = await getGooglePaymentDataRequest();
      const paymentsClient = getGooglePaymentsClient();
      paymentsClient.loadPaymentData(paymentDataRequest);
    }
  });
}

/**
 * Process payment data returned by the Google Pay API
 *
 * @param {object} paymentData response from Google Pay API after user approves payment
 * @see {@link https://developers.google.com/pay/api/web/reference/response-objects#PaymentData|PaymentData object reference}
 */
async function processPayment(paymentData: any) {
  console.log('process payment');
  try {
    const transaction = await createTransaction('paypal');
    if (!transaction || !transaction.id) throw new Error('Transaction creation failed.');
    console.log('transaction', transaction);
    const order = await createOrder({
      paymentId: cart.value.methodOfPaymentId,
      shippingPrivacyHintAccepted: shippingPrivacyAgreement.value,
    });
    if (!order || !order.order || !order.order.id) throw new Error('Order creation failed.');

    console.log(' ===== Order Created =====', order);
    /** Approve Payment */

    const { status } = await (paypal as any).Googlepay().confirmOrder({
      orderId: transaction.id,
      token: paymentData.token,
      paymentMethodData: paymentData.paymentMethodData,
    });
    console.log(' ===== Order Created =====', status);

    if (status === 'PAYER_ACTION_REQUIRED') {
      console.log(' ===== Confirm Payment Completed Payer Action Required ===== ');
      (paypal as any)
        .Googlepay()
        .initiatePayerAction({ orderId: order.order.id })
        .then(async (data: any) => {
          /**
           *  GET Order
           */
          await captureOrder({
            paypalOrderId: data.paypalOrderId,
            paypalPayerId: data.paypalPayerId,
          });

          await executeOrder({
            mode: 'paypal',
            plentyOrderId: Number.parseInt(orderGetters.getId(order)),
            paypalTransactionId: data.orderID,
          });

          console.log(' ===== 3DS Contingency Result Fetched ===== ');
          /*
           * CAPTURE THE ORDER
           */
          console.log(' ===== Payer Action Completed ===== ');

          // resultElement.innerHTML = captureResponse;
        });
    } else {
      /*
       * CAPTURE THE ORDER
       */

      // eslint-disable-next-line no-unused-vars
      const response = await executeOrder({
        mode: 'paypal',
        plentyOrderId: Number.parseInt(orderGetters.getId(order)),
        paypalTransactionId: transaction.id,
      });
      console.log(' ===== Order Capture Completed ===== ');
    }
    clearCartItems();

    navigateTo(localePath(paths.confirmation + '/' + order.order.id + '/' + order.order.accessKey));

    return { transactionState: 'SUCCESS' };
  } catch (error: any) {
    return {
      transactionState: 'ERROR',
      error: {
        // eslint-disable-next-line max-lines
        message: error.message,
      },
    };
  }
}
onMounted(async () => {
  await loadGooglePay().then(() => {
    // eslint-disable-next-line promise/always-return,max-lines
    if (google && (paypal as any).Googlepay) {
      onGooglePayLoaded().catch(console.error);
    }
  });
});
</script>
