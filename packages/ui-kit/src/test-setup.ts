// happy-dom has no ElementInternals yet, and violet-elements' form fields call
// attachInternals() in their constructors. This stands in for the parts they use; real
// browsers (and the Vite dev server) use the platform's.
if (!('attachInternals' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
    configurable: true,
    value(this: HTMLElement) {
      let validity: Partial<ValidityState> = { valid: true };
      let message = '';
      return {
        ariaInvalid: null as string | null,
        form: this.closest('form'),
        get validity() {
          return validity;
        },
        get validationMessage() {
          return message;
        },
        willValidate: true,
        setFormValue() {},
        setValidity(flags: Partial<ValidityState> = {}, text = '') {
          validity = { ...flags, valid: !Object.values(flags).some(Boolean) };
          message = text;
        },
        checkValidity: () => validity.valid !== false,
        reportValidity: () => validity.valid !== false,
      };
    },
  });
}
