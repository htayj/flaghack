import {List} from 'immutable';

export type Matrix<T> = List<List<T>>;

export type UndefOr<T> = T | undefined;
export const defined = <T>(a: UndefOr<T>) => a !== undefined;

export const nullMatrix = (h: number, w: number): Matrix<null> => {
	const rows = Array<null[]>(h);
	const filled = rows.fill(Array<null>(w).fill(null));
	/* filled.map( row => rownull) */

	return List(filled.map(List));
};

export const filterIs = <T, R extends T>(
	u: T,
	f: (a: T) => a is R,
): UndefOr<R> => (f(u) ? u : undefined);

export const identity = <T extends any>(a: T) => a;
export const noop = <T extends any>(_: T) => undefined;

// export const hasProperty = <
// 	P extends Object,
// 	K extends keyof P,
// 	T extends Omit<P, K>,
// >(
// 	o: T,
// 	property: K,
// ): o is T & Pick<P, K> => o.hasOwnProperty(property);
// export const hasProperty = <T extends Object, P extends string>(
// 	o: T,
// 	property: P,
// ): o is T & {[key: P] : unknown} => o.hasOwnProperty(property);

type CFilterPredicate<K, V, I> = <F extends V>(
	value: V,
	key: K,
	iter: I,
) => value is F;
type CMapPredicate<K, V, I, R> = (value: V, key: K, iter: I) => R;

export const cfilter =
	<
		K,
		V,
		I,
		P extends CFilterPredicate<K, V, I>,
		T extends {filter: (pred: P) => T},
	>(
		fn: P,
	) =>
	(collection: T) =>
		collection.filter(fn);

export const cmap =
	<K, V, I, R, T extends {filter: (pred: CMapPredicate<K, V, I, R>) => T}>(
		fn: CMapPredicate<K, V, I, R>,
	) =>
	(collection: T) =>
		collection.filter(fn);
