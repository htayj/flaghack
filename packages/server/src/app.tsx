import React, {useState} from 'react';
import Playing from './components/Playing.tsx';
import ModeError from './components/ModeError.tsx';
import {CliType} from './cli.tsx';

type Props = {
	opts: CliType;
};
export type Opts = {name: string};
export type AppMode = 'playing';
export default function App({}: Props) {
	const [mode, setMode] = useState<AppMode>('playing');

	return mode === 'playing' ? (
		<Playing username="test" />
	) : (
		<ModeError mode={mode} />
	);
}
