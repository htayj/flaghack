import { Map, Record } from 'immutable';
// import {Creature, isPlayer, Player, player} from './creatures';
import { isCreature, isPlayer, player } from './creatures.js';
import { getKey, movePosition } from './entity.js';
import { map, filter } from 'scala-ts/UndefOr.js';
export var Action;
(function (Action) {
    Action[Action["apply"] = 0] = "apply";
    Action[Action["noop"] = 1] = "noop";
    Action[Action["moveLeft"] = 2] = "moveLeft";
    Action[Action["moveDown"] = 3] = "moveDown";
    Action[Action["moveRight"] = 4] = "moveRight";
    Action[Action["moveUp"] = 5] = "moveUp";
})(Action || (Action = {}));
var _GameState = Record({
    world: Map(),
})();
var setGameState = function (s) {
    _GameState = s;
};
var getGameState = function () { return _GameState; };
var updateGameStateInMemory = function (fn) {
    return setGameState(fn(getGameState()));
};
var updateWorld = function (gs) { return function (fn) {
    return gs.update('world', fn);
}; };
var updateEntity = function (gs) {
    return function (e) {
        return function (fn) {
            return updateWorld(gs)(function (w) { return w.update(getKey(e), function (_) { return map(e, fn); }); });
        };
    };
};
var getPlayer = function (gs) {
    return filter(gs.get('world').find(isPlayer), isPlayer);
};
export var doAction = function (action, c) {
    updateGameStateInMemory(function (gs) {
        var _a;
        var crea = (_a = c !== null && c !== void 0 ? c : getPlayer(gs)) !== null && _a !== void 0 ? _a : player(2, 2);
        switch (action) {
            case Action.moveLeft: {
                return updateEntity(gs)(crea)(function (c) {
                    var _a;
                    return (_a = map(filter(c, isCreature), function (c) { return movePosition(c, { x: -1, y: 0 }); })) !== null && _a !== void 0 ? _a : c;
                });
            }
            default:
                return gs;
        }
    });
    return getGameState();
};
