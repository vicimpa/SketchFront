import type { Vec3 } from '../math/vec3.ts';

/** Body zone a bullet hit, picks the damage multiplier. */
export type HitZone = 'head' | 'torso' | 'limb';

/**
 * Hitbox as a capsule: the segment a-b swept by a sphere of the given radius.
 * Capsules are rebuilt from the skeleton every tick and are what the server
 * will rewind for lag compensation, so they never depend on skins.
 */
export interface Capsule
{
	a: Vec3;
	b: Vec3;
	radius: number;
	zone: HitZone;
}

/**
 * Distance along a normalized ray to where it enters the capsule, or null on a miss.
 * A ray starting inside the capsule hits at 0.
 */
export function intersectRayCapsule(origin: Vec3, direction: Vec3, capsule: Capsule): number | null
{
	const { a, b, radius } = capsule;
	const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
	const oax = origin.x - a.x, oay = origin.y - a.y, oaz = origin.z - a.z;

	const baba = bax * bax + bay * bay + baz * baz;
	const bard = bax * direction.x + bay * direction.y + baz * direction.z;
	const baoa = bax * oax + bay * oay + baz * oaz;
	const rdoa = direction.x * oax + direction.y * oay + direction.z * oaz;
	const oaoa = oax * oax + oay * oay + oaz * oaz;

	// Degenerate segment: plain sphere
	if (baba < 1e-12) return intersectRaySphere(rdoa, oaoa, radius);

	// Infinite cylinder around the segment
	const qa = baba - bard * bard;
	const qb = baba * rdoa - baoa * bard;
	const qc = baba * oaoa - baoa * baoa - radius * radius * baba;

	if (qc <= 0)
	{
		// Origin is inside the infinite cylinder; inside the capsule if within the caps
		const y = baoa;
		if (y >= 0 && y <= baba) return 0;
	}

	if (qa > 1e-12)
	{
		const h = qb * qb - qa * qc;
		if (h < 0) return null;
		const t = (-qb - Math.sqrt(h)) / qa;
		const y = baoa + t * bard;
		if (t >= 0 && y > 0 && y < baba) return t;
	}

	// The side was missed, so the ray can only enter through one of the end spheres
	const tA = intersectRaySphere(rdoa, oaoa, radius);
	const obx = origin.x - b.x, oby = origin.y - b.y, obz = origin.z - b.z;
	const tB = intersectRaySphere(
		direction.x * obx + direction.y * oby + direction.z * obz,
		obx * obx + oby * oby + obz * obz, radius);

	if (tA !== null && tB !== null) return Math.min(tA, tB);
	return tA ?? tB;
}

/** Ray-sphere entry distance from dot(direction, origin - center) and |origin - center|². */
function intersectRaySphere(rdo: number, oo: number, radius: number): number | null
{
	const c = oo - radius * radius;
	if (c <= 0) return 0;
	const h = rdo * rdo - c;
	if (h < 0) return null;
	const t = -rdo - Math.sqrt(h);
	return t >= 0 ? t : null;
}
