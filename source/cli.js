#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './app.js';
var cli = meow("\n\tUsage\n\t  $ flag-hack\n\n\tOptions\n\t\t--name  Your name\n\n\tExamples\n\t  $ flag-hack --name=Jane\n\t  Hello, Jane\n", {
    importMeta: import.meta,
    flags: {
        name: {
            type: 'string',
        },
    },
});
render(React.createElement(App, { name: cli.flags.name }));
