import { pipe, Schema as S } from "effect";
// import { dual } from "effect/Function"
// using extend and union - cant use .make?
export const bothof = S.extend;
export const oneof = S.Union;
export const and = (a) => (b) => bothof(a, b);
export const or = (a) => (b) => oneof(a, b);
export function allof(...schemas) {
    return schemas.reduce((acc, curr) => bothof(acc, curr));
}
export const struct = S.Struct;
export const number = S.Number;
export const boolean = S.Boolean;
export const between = S.between;
export const prop = (name, schema) => struct({ [name]: schema });
export const numberbetween = (start, end) => pipe(number, between(start, end));
export const collect = (...items) => [
    allof(...items),
    oneof(...items)
];
//# sourceMappingURL=util.js.map