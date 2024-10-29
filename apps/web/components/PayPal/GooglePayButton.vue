<template>
  <div id="google-pay-button"></div>
</template>

<script lang="ts" setup>
import { PayPalAddToCartCallback } from '~/components/PayPal/types';

const { initialize, paymentsClient, googleConfig, getGooglePaymentDataRequest, processPayment, getIsReadyToPayRequest } = useGooglePay();
const emits = defineEmits<{
  (event: 'button-clicked', callback: PayPalAddToCartCallback): Promise<void>;
}>();

async function onGooglePaymentButtonClicked() {
  console.log('onGooglePaymentButtonClicked2')
  await emits('button-clicked', async (successfully) => {
    if (successfully) {
      const paymentDataRequest = getGooglePaymentDataRequest();
      console.log('paymentDataRequest', paymentDataRequest)
      /*
      paymentsClient.value
        .loadPaymentData(paymentDataRequest)
        // eslint-disable-next-line promise/always-return
        .then((paymentData: google.payments.api.PaymentData) => {
          processPayment(paymentData).catch((error) => {
            useNotification().send({
              message: error.message || error || 'An error occurred while processing the payment. Please try again.',
              type: 'negative',
            });
          });
        })
        .catch((error) => {
          console.error(error);
        });
       */
    }
  });
}

const addGooglePayButton = () => {
  try {
    console.log('addGooglePayButton', paymentsClient.value);
    console.log('onGooglePaymentButtonClicked', onGooglePaymentButtonClicked)
    const button = paymentsClient.value.createButton({
      onClick: onGooglePaymentButtonClicked,
    });
    console.log('button init');
    const theContainer = document.querySelector('#google-pay-button');
    console.log('container', theContainer);
    if (theContainer) {
      theContainer.append(button);
      console.log('button appended')
    }
  } catch (error) {
    console.error(error);
  }
};

const onGooglePayLoaded = async () => {
  try {
    console.log('getIsReadyToPayRequest', getIsReadyToPayRequest());
    const response = await paymentsClient.value.isReadyToPay(getIsReadyToPayRequest());
    console.log('onGooglePayLoaded', response)
    if (response.result) {
      addGooglePayButton();
    }
  } catch (error) {
    console.error(error);
  }
};

const createButton = async () => {
  if (await initialize()) {
    console.log('initialize', paymentsClient.value)
    onGooglePayLoaded().then().catch();
  }
};

onMounted(async () => {
  await createButton();
});
</script>
