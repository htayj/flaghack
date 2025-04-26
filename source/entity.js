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
// import {isCreature} from './creatures.ts';
// import {Entity} from './gameloop.ts';
import { shift } from "./position.js";
export var getKey = function (a) { return a.key; };
// export const isPositioned = (a: Entity): a is Positioned=> isCreature(a)
export var isPosition = function (e) { return typeof e === 'object'; };
export var genKey = function () { return (Math.random() * Math.pow(2, 8)).toString(16); };
export var movePosition = function (e, by) { return (__assign(__assign({}, e), { pos: shift(e.pos, by) })); };
