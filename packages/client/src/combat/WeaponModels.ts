import * as THREE from 'three';

/**
 * Placeholder weapon models built from boxes, sized for the 1 m tall boxman.
 * The model points along +Z with the grip at the origin; `muzzle` marks where rounds leave.
 */
export interface WeaponModel
{
	root: THREE.Group;
	muzzle: THREE.Object3D;
	materials: THREE.Material[];
}

type Part = [width: number, height: number, length: number, x: number, y: number, z: number, color: number];

const DARK = 0x2b2d30;
const STEEL = 0x55595e;
const WOOD = 0x6b4a2f;

const PARTS: Record<string, { parts: Part[]; muzzle: number }> = {
	rifle: {
		parts: [
			[0.035, 0.05, 0.22, 0, 0.01, 0.05, DARK],      // receiver
			[0.018, 0.018, 0.14, 0, 0.018, 0.22, STEEL],   // barrel
			[0.03, 0.045, 0.1, 0, 0.005, -0.1, DARK],      // stock
			[0.022, 0.07, 0.03, 0, -0.04, 0.07, STEEL],    // magazine
			[0.02, 0.045, 0.025, 0, -0.03, 0.0, DARK],     // grip
		],
		muzzle: 0.29,
	},
	pistol: {
		parts: [
			[0.025, 0.035, 0.11, 0, 0.02, 0.04, DARK],     // slide
			[0.022, 0.06, 0.03, 0, -0.01, 0.0, STEEL],     // grip
		],
		muzzle: 0.1,
	},
	shotgun: {
		parts: [
			[0.035, 0.05, 0.16, 0, 0.01, 0.03, DARK],      // receiver
			[0.026, 0.026, 0.2, 0, 0.02, 0.2, STEEL],      // barrel
			[0.03, 0.03, 0.1, 0, -0.012, 0.17, WOOD],      // pump
			[0.03, 0.05, 0.12, 0, 0.0, -0.11, WOOD],       // stock
		],
		muzzle: 0.3,
	},
};

const box = new THREE.BoxGeometry(1, 1, 1);

export function createWeaponModel(weaponId: string): WeaponModel
{
	const spec = PARTS[weaponId] ?? PARTS.rifle;
	const root = new THREE.Group();
	root.name = `weapon_${weaponId}`;
	const materials = new Map<number, THREE.MeshPhongMaterial>();

	for (const [width, height, length, x, y, z, color] of spec.parts)
	{
		if (!materials.has(color)) materials.set(color, new THREE.MeshPhongMaterial({ color, shininess: 20 }));

		const mesh = new THREE.Mesh(box, materials.get(color));
		mesh.scale.set(width, height, length);
		mesh.position.set(x, y, z);
		mesh.castShadow = true;
		root.add(mesh);
	}

	const muzzle = new THREE.Object3D();
	muzzle.position.set(0, 0.02, spec.muzzle);
	root.add(muzzle);

	return { root, muzzle, materials: [...materials.values()] };
}
