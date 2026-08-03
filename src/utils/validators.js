const isValidCurrencyCode = (code) => /^[A-Z]{3}$/.test(code);

module.exports = { isValidCurrencyCode };
