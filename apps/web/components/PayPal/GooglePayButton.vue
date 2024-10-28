<template>
  <div id="google-pay-button"></div>
</template>

<script lang="ts" setup>
import { PayPalAddToCartCallback } from '~/components/PayPal/types';

const { initialize, paymentsClient, googleConfig, getGooglePaymentDataRequest, processPayment, getIsReadyToPayRequest } = useGooglePay();
const emits = defineEmits<{
  (event: 'button-clicked', callback: PayPalAddToCartCallback): Promise<void>;
}>();

const onGooglePaymentButtonClicked = async () => {
  await emits('button-clicked', async (successfully) => {
    if (successfully) {
      const paymentDataRequest = await getGooglePaymentDataRequest();
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
    }
  });
};

const addGooglePayButton = () => {
  if (paymentsClient.value) {
    const button = paymentsClient.value.createButton({
      onClick: onGooglePaymentButtonClicked,
    });
    const theContainer = document.querySelector('#google-pay-button');
    if (theContainer) {
      theContainer.append(button);
    }
  }
};

const onGooglePayLoaded = async () => {
  try {
    console.log('request', {
      allowedPaymentMethods: googleConfig.value.allowedPaymentMethods,
      apiVersion: googleConfig.value.apiVersion,
      apiVersionMinor: googleConfig.value.apiVersionMinor,
    });
    const response = await paymentsClient.value.isReadyToPay({
      allowedPaymentMethods: googleConfig.value.allowedPaymentMethods,
      apiVersion: googleConfig.value.apiVersion,
      apiVersionMinor: googleConfig.value.apiVersionMinor,
    });
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
