<template>
  <form ref="referenceRef" role="search" class="relative" @submit.prevent="handleSubmit">
    <SfInput ref="inputRef" v-model="inputModel" aria-label="Search" placeholder="Search" @focus="open">
      <template #prefix>
        <SfIconSearch />
      </template>
      <template #suffix>
        <button
          v-if="inputModel"
          type="button"
          aria-label="Reset search"
          class="flex rounded-md focus-visible:outline focus-visible:outline-offset"
          @click="handleReset"
        >
          <SfIconCancel />
        </button>
      </template>
    </SfInput>
  </form>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { SfIconCancel, SfIconSearch, SfInput, useDisclosure } from '@storefront-ui/vue';
import { unrefElement } from '@vueuse/core';

const props = defineProps<{
  close?: () => boolean;
}>();

const router = useRouter();
const { open } = useDisclosure();

const inputModel = ref('');
const inputRef = ref();
const handleInputFocus = () => {
  const inputEl = unrefElement(inputRef)?.querySelector('input');
  inputEl?.focus();
};
const handleReset = () => {
  inputModel.value = '';
  handleInputFocus();
};
const handleSubmit = () => {
  props.close && props.close();
  router.push({ path: paths.search, query: { search: inputModel.value } });
  handleReset();
};

watch(inputModel, () => {
  if (inputModel.value === '') {
    handleReset();
  }
});
</script>