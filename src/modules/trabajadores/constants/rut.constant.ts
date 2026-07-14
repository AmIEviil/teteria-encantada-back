// Hasta 9 digitos de cuerpo + guion + digito verificador (0-9 o K): "202800074-2".
export const RUT_REGEX = /^\d{1,9}-[\dK]$/;
export const RUT_MESSAGE =
  'El RUT debe tener formato 202800074-2 (hasta 9 digitos y verificador 0-9 o K)';
