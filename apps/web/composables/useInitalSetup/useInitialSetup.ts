import { Cart, SessionResult } from '@plentymarkets/shop-api';
import { useSdk } from '~/sdk';
import { SetInitialData, UseInitialSetupReturn } from './types';
import { getCurrentInstance } from 'vue';

/** Function for getting current customer/cart data from session
 * @return SetInitialData
 * @example
 * ``` ts
 * setInitialData();
 * ```
 */
const setInitialData: SetInitialData = async () => {
  const { setUser } = useCustomer();
  const { setCart, loading: cartLoading } = useCart();

  cartLoading.value = true;
  const { data, error } = await useAsyncData(() => useSdk().plentysystems.getSession());
  useHandleError(error.value);

  setUser(data.value?.data as SessionResult);
  setCart(data.value?.data.basket as Cart);

  const csrf = data.value?.data.csrf;

  const appInstance = getCurrentInstance();
  interface CsrfObject {
    updateCSRFToken: (token: string) => void;
  }

  if (appInstance && appInstance.appContext.config.globalProperties.$csrf) {
    appInstance.appContext.config.globalProperties.$csrf.updateCSRFToken(csrf);
  }
  console.log('csrf:' + csrf);

  cartLoading.value = false;

  return true;
};

/**
 * @description Composable to get initial customer and cart data
 * @returns UseInitialSetupReturn
 * @example
 * ``` ts
 * const { setInitialData } = useInitialSetup();
 * ```
 */
export const useInitialSetup: UseInitialSetupReturn = () => {
  return {
    setInitialData,
  };
};
