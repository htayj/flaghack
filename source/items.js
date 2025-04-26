var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { genKey } from './entity.js';
export var groundFlag = function (pos) { return ({
    in: pos,
    type: 'flag',
    kind: 'item',
    key: genKey(),
}); };
export var isItem = function (e) { return e.kind === 'item'; };
export var pickup = function (item, by) { return (__assign(__assign({}, item), { in: by.key })); };
export var drop = function (item, by) { return (__assign(__assign({}, item), { in: by.pos })); };
