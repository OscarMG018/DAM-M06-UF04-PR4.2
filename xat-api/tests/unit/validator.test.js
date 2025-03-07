const { validateUUID } = require('../../src/middleware/validators');

describe('validateUUID', () => {
  it('hauria de retornar true per un UUID vàlid', () => {
    const uuidValido = '123e4567-e89b-12d3-a456-426614174000';
    expect(validateUUID(uuidValido)).toBe(true);
  });

  it('hauria de retornar false per un UUID invàlid (format incorrecte)', () => {
    const uuidInvalido = 'esto-no-es-un-uuid';
    expect(validateUUID(uuidInvalido)).toBe(false);
  });

  it('hauria de retornar false per un UUID invàlid (longitud incorrecta)', () => {
    const uuidCorto = '123e4567-e89b-12d3-a456';
    expect(validateUUID(uuidCorto)).toBe(false);
  });

  it('hauria de retornar false per un UUID invàlid (caràcters incorrectes)', () => {
    const uuidCaracteresInvalidos = '123e4567-e89b-12d3-a456-42661417400g'; // 'g' no és vàlid
    expect(validateUUID(uuidCaracteresInvalidos)).toBe(false);
  });

  it('hauria de retornar false per un string buit', () => {
    expect(validateUUID('')).toBe(false);
  });

  it('hauria de retornar false per null', () => {
    expect(validateUUID(null)).toBe(false);
  });

  it('hauria de retornar false per undefined', () => {
    expect(validateUUID(undefined)).toBe(false);
  });
});