import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
declare const GameApiGroup_base: HttpApiGroup.HttpApiGroup<"todos", HttpApiEndpoint.HttpApiEndpoint<"getLogs", "GET", never, never, never, never, readonly string[], never, never, never> | HttpApiEndpoint.HttpApiEndpoint<"getWorld", "GET", never, never, never, never, import("effect/HashMap").HashMap<string, ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "flag";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "water";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "acid";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "booze";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "poptart";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "trailmix";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "pancake";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "bacon";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "soup";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "player";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "ranger";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "hippie";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "wook";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "acidcop";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "lesser_egregore";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "greater_egregore";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "collective_egregore";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "wall";
})>, never, never, never> | HttpApiEndpoint.HttpApiEndpoint<"getInventory", "GET", never, never, never, never, readonly import("effect/HashMap").HashMap<string, ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "flag";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "water";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "acid";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "booze";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "poptart";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "trailmix";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "pancake";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "bacon";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "soup";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "player";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "ranger";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "hippie";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "wook";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "acidcop";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "lesser_egregore";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "greater_egregore";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly name?: string | undefined;
} & {
    readonly _tag: "collective_egregore";
}) | ({
    readonly key: string;
} & {
    readonly at: {
        readonly x: number;
        readonly y: number;
    };
} & {
    readonly in: string;
} & {
    readonly _tag: "wall";
})>[], never, never, never> | HttpApiEndpoint.HttpApiEndpoint<"doAction", "POST", never, never, {
    readonly _tag: "action";
} | {
    readonly _tag: "noop";
} | {
    readonly _tag: "move";
    readonly dir: "N" | "E" | "S" | "W" | "NE" | "NW" | "SE" | "SW";
} | {
    readonly object: ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "flag";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "water";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "acid";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "booze";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "poptart";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "trailmix";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "pancake";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "bacon";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "soup";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "player";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "ranger";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "hippie";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "wook";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "acidcop";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "lesser_egregore";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "greater_egregore";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "collective_egregore";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "wall";
    });
    readonly _tag: "pickup";
}, never, {
    readonly world: import("effect/HashMap").HashMap<string, ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "flag";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "water";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "acid";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "booze";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "poptart";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "trailmix";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "pancake";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "bacon";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "soup";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "player";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "ranger";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "hippie";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "wook";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "acidcop";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "lesser_egregore";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "greater_egregore";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly name?: string | undefined;
    } & {
        readonly _tag: "collective_egregore";
    }) | ({
        readonly key: string;
    } & {
        readonly at: {
            readonly x: number;
            readonly y: number;
        };
    } & {
        readonly in: string;
    } & {
        readonly _tag: "wall";
    })>;
}, never, never, never>, never, never, false>;
export declare class GameApiGroup extends GameApiGroup_base {
}
declare const GameApi_base: HttpApi.HttpApi<"api", typeof GameApiGroup, import("@effect/platform/HttpApiError").HttpApiDecodeError, never>;
export declare class GameApi extends GameApi_base {
}
export {};
//# sourceMappingURL=TodosApi.d.ts.map