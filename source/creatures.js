import { genKey } from "./entity.js";
export var player = function (x, y) { return ({
    pos: { x: x, y: y },
    type: 'player',
    char: '@',
    name: 'you',
    kind: 'creature',
    key: genKey(),
}); };
export var isCreature = function (e) { return e.kind === 'creature'; };
export var isPlayer = function (e) { return e.type === 'player'; };
export var hippie = function (x, y, name) {
    if (name === void 0) { name = 'Ian'; }
    return ({
        pos: { x: x, y: y },
        type: 'npc',
        char: 'h',
        name: name,
        kind: 'creature',
        key: genKey(),
    });
};
