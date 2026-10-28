import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import * as Utils from '../../core/FunctionLibrary';
import {ICollider} from '../../interfaces/ICollider';
import {Object3D} from 'three';

export class TrimeshCollider implements ICollider
{
	public mesh: any;
	public options: any;
	public body: CANNON.Body;
	public debugModel: any;

	constructor(mesh: Object3D, options: any)
	{
		this.mesh = mesh.clone();

		let defaults = {
			mass: 0,
			position: mesh.position,
			rotation: mesh.quaternion,
			friction: 0.3
		};
		options = Utils.setDefaults(options, defaults);
		this.options = options;

		let mat = new CANNON.Material('triMat');
		mat.friction = options.friction;
		// mat.restitution = 0.7;

		let shape = TrimeshCollider.createShape(this.mesh);

		// Add phys sphere
		let physBox = new CANNON.Body({
			mass: options.mass,
			position: options.position,
			quaternion: options.rotation,
			shape: shape
		});

		physBox.material = mat;

		this.body = physBox;
	}

	/**
	 * Builds a trimesh from the mesh geometry with the world scale baked in
	 * (a CANNON.Shape can't be scaled later). Position and rotation go on the body.
	 */
	private static createShape(mesh: THREE.Mesh): CANNON.Trimesh
	{
		const position = new THREE.Vector3();
		const quaternion = new THREE.Quaternion();
		const scale = new THREE.Vector3();
		mesh.updateMatrixWorld();
		mesh.matrixWorld.decompose(position, quaternion, scale);

		const positions = mesh.geometry.attributes.position;
		const vertices = new Array<number>(positions.count * 3);
		for (let i = 0; i < positions.count; i++)
		{
			vertices[i * 3] = positions.getX(i) * scale.x;
			vertices[i * 3 + 1] = positions.getY(i) * scale.y;
			vertices[i * 3 + 2] = positions.getZ(i) * scale.z;
		}

		const index = mesh.geometry.index;
		const indices = index !== null
			? Array.from(index.array)
			: Array.from({ length: positions.count }, (_, i) => i);

		return new CANNON.Trimesh(vertices, indices);
	}
}
