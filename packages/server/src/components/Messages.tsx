import React from 'react';
import {Box, Text} from 'ink';
import {List} from 'immutable';

type Props = {
	messages: List<string>;
};

export default function Messages({messages}: Props) {
	return (
		<Box overflow="hidden" borderStyle="round" height={30} width={100}>
			<Text>
				{messages.map((message, i) => (
					<Text key={messages.size - i}>
						$ {message} {'\n'}
					</Text>
				))}
			</Text>
		</Box>
	);
}
