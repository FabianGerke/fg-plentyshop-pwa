<template>
  <div id="google-pay-button"></div>

  <div
    v-if="paymentLoading"
    class="fixed top-0 left-0 bg-black bg-opacity-50 bottom-0 right-0 !z-50 flex items-center justify-center flex-col"
  >
    <div class="text-white mb-4">Payment in progress...</div>
    <SfLoaderCircular class="flex justify-center items-center" size="lg" />
  </div>
</template>

<script lang="ts" setup>
import { PayPalAddToCartCallback } from '~/components/PayPal/types';
import { SfLoaderCircular } from '@storefront-ui/vue';

const {
  initialize,
  paymentsClient,
  paymentLoading,
  getGooglePaymentDataRequest,
  processPayment,
  getIsReadyToPayRequest,
} = useGooglePay();
const emits = defineEmits<{
  (event: 'button-clicked', callback: PayPalAddToCartCallback): Promise<void>;
}>();

async function onGooglePaymentButtonClicked() {
  await emits('button-clicked', async (successfully) => {
    if (successfully) {
      const paymentDataRequest = getGooglePaymentDataRequest();
      toRaw(paymentsClient.value)
        .loadPaymentData(paymentDataRequest)
        // eslint-disable-next-line promise/always-return
        .then((paymentData: google.payments.api.PaymentData) => {
          processPayment(paymentData).catch((error) => {
            useNotification().send({
              message: error.message || error || 'An error occurred while processing the payment. Please try again.',
              type: 'negative',
            });
            paymentLoading.value = false;
          });
        })
        .catch((error) => {
          console.error(error);
        });
    }
  });
}

const addGooglePayButton = () => {
  try {
    const button = toRaw(paymentsClient.value).createButton({
      onClick: onGooglePaymentButtonClicked,
    });
    const theContainer = document.querySelector('#google-pay-button');
    if (theContainer) {
      theContainer.append(button);
    }
  } catch (error) {
    console.error(error);
  }
};

const onGooglePayLoaded = async () => {
  try {
    const response = await toRaw(paymentsClient.value).isReadyToPay(getIsReadyToPayRequest());
    if (response.result) {
      addGooglePayButton();
    }
  } catch (error) {
    console.error(error);
  }
};

const createButton = async () => {
  if (await initialize()) {
    onGooglePayLoaded().then().catch();
  }
};

onMounted(async () => {
  await createButton();
});
</script>
