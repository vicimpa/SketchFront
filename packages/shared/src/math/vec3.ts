// Plain vector type so shared code stays free of three.js and cannon-es.
// Both libraries' vectors satisfy it structurally.

export interface Vec3
{
	x: number;
	y: number;
	z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3
{
	return { x, y, z };
}

export function dot(a: Vec3, b: Vec3): number
{
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function distance(a: Vec3, b: Vec3): number
{
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Point at origin + direction * t. */
export function along(origin: Vec3, direction: Vec3, t: number): Vec3
{
	return { x: origin.x + direction.x * t, y: origin.y + direction.y * t, z: origin.z + direction.z * t };
}
