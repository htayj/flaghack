import React from 'react';
import {AppMode} from '../app.tsx';
import {Box} from 'ink';

type Props = {
	mode: AppMode;
};
export type Opts = {name: string};
export default function App({mode}: Props) {
	return <Box> unsupported app mode: {mode} </Box>;
}
