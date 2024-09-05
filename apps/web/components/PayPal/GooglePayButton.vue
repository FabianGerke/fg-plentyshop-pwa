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
import { cartGetters } from '@plentymarkets/shop-api';

let isGooglePayLoaded = false;
const { loadScript, executeOrder, createTransaction } = usePayPal();
const { shippingPrivacyAgreement } = useAdditionalInformation();
const { createOrder } = useMakeOrder();
const { data: cart } = useCart();
const currency = computed(() => cartGetters.getCurrency(cart.value) || (useAppConfig().fallbackCurrency as string));
const paypal = await loadScript(currency.value);
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
  return new Promise(async (resolve, reject) => {
    try {
      // Create the order on your server
      const transaction = await createTransaction('googlepay');
      if (!transaction || !transaction.id) throw new Error('Transaction creation failed.');
      console.log('transaction created', transaction.id);
      const order = await createOrder({
        paymentId: cart.value.methodOfPaymentId,
        shippingPrivacyHintAccepted: shippingPrivacyAgreement.value,
      });
      if (!order || !order.order || !order.order.id) throw new Error('Order creation failed.');
      console.log('order created', order.order.id);

      const confirmOrder = await (paypal as any).Googlepay().confirmOrder({
        orderId: order.order.id,
        paymentMethodData: paymentData.paymentMethodData,
        token: paymentData.token,
      });
      /** Capture the Order on your Server */
      console.log('status created', confirmOrder.status);

      // await executeOrder({
      //   mode: 'paypal',
      //   plentyOrderId: Number.parseInt(orderGetters.getId(order)),
      //   paypalTransactionId: transaction.id,
      // });

      if (confirmOrder.status === 'APPROVED') {
        const response = await fetch(`/capture/${transaction.id}`, {
          method: 'POST',
        }).then((res) => res.json());
        if (response.capture.status === 'COMPLETED') resolve({ transactionState: 'SUCCESS' });
        else
          resolve({
            transactionState: 'ERROR',
            error: {
              intent: 'PAYMENT_AUTHORIZATION',
              message: 'TRANSACTION FAILED',
            },
          });
      } else {
        resolve({
          transactionState: 'ERROR',
          error: {
            intent: 'PAYMENT_AUTHORIZATION',
            message: 'TRANSACTION FAILED',
          },
        });
      }
    } catch (error: any) {
      resolve({
        transactionState: 'ERROR',
        error: {
          intent: 'PAYMENT_AUTHORIZATION',
          message: error.message,
        },
      });
    }
  });
}

onMounted(async () => {
  await loadGooglePay().then(() => {
    // eslint-disable-next-line promise/always-return
    if (google && (paypal as any).Googlepay) {
      const modal = document.querySelector('#resultModal');
      if (modal) {
        window.addEventListener('click', function (event) {
          if (event.target === modal && modal instanceof HTMLElement) {
            modal.style.display = 'none';
          }
        });
      }
      onGooglePayLoaded().catch(console.error);
    }
  });
});
</script>
