import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { init, NavMesh, NavMeshQuery } from 'recast-navigation';
import { generateTiledNavMesh } from 'recast-navigation/generators';
import { CollisionGroups } from '../enums/CollisionGroups';

// Sized for boxman: about 1 m tall with a 0.25 m capsule radius
const NAVMESH_CONFIG = {
	cs: 0.15,
	ch: 0.1,
	tileSize: 64,
	walkableSlopeAngle: 45,
	walkableHeight: 10,     // cells of ch: 1 m
	walkableClimb: 3,       // cells of ch: 0.3 m
	walkableRadius: 2,      // cells of cs: 0.3 m
	maxEdgeLen: 40,
	maxSimplificationError: 1.3,
	minRegionArea: 8,
	mergeRegionArea: 20,
	maxVertsPerPoly: 6,
	detailSampleDist: 6,
	detailSampleMaxError: 1,
};

const vertex = new CANNON.Vec3();
const worldVertex = new CANNON.Vec3();
const shapePosition = new CANNON.Vec3();
const shapeQuaternion = new CANNON.Quaternion();

/** Navigation mesh of the level's static colliders, and path queries on it. */
export class Navigation
{
	public readonly navMesh: NavMesh;
	public readonly query: NavMeshQuery;

	private constructor(navMesh: NavMesh)
	{
		this.navMesh = navMesh;
		this.query = new NavMeshQuery(navMesh);
	}

	/** Builds the navmesh from every static body the characters can collide with. */
	public static async build(physicsWorld: CANNON.World): Promise<Navigation>
	{
		await init();

		const { positions, indices } = collectStaticGeometry(physicsWorld);
		const result = generateTiledNavMesh(positions, indices, NAVMESH_CONFIG);
		if (!result.success) throw new Error('Navmesh generation failed');

		return new Navigation(result.navMesh);
	}

	/** Path as a list of corner points, or an empty list when there is none. */
	public findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[]
	{
		const { success, path } = this.query.computePath(from, to, { halfExtents: { x: 2, y: 4, z: 2 } });
		if (!success) return [];
		return path.map((p) => new THREE.Vector3(p.x, p.y, p.z));
	}

	/** Random reachable point within radius of a position, or null. */
	public randomPointAround(center: THREE.Vector3, radius: number): THREE.Vector3 | null
	{
		const { success, randomPoint } = this.query.findRandomPointAroundCircle(center, radius, { halfExtents: { x: 2, y: 4, z: 2 } });
		return success ? new THREE.Vector3(randomPoint.x, randomPoint.y, randomPoint.z) : null;
	}
}

/** World-space triangles of all static, default-group bodies (boxes and trimeshes). */
function collectStaticGeometry(physicsWorld: CANNON.World): { positions: number[]; indices: number[] }
{
	const positions: number[] = [];
	const indices: number[] = [];

	const addVertex = (local: CANNON.Vec3, body: CANNON.Body) =>
	{
		shapeQuaternion.vmult(local, worldVertex);
		worldVertex.vadd(shapePosition, worldVertex);
		body.quaternion.vmult(worldVertex, worldVertex);
		worldVertex.vadd(body.position, worldVertex);
		positions.push(worldVertex.x, worldVertex.y, worldVertex.z);
	};

	for (const body of physicsWorld.bodies)
	{
		if (body.type !== CANNON.Body.STATIC || (body.collisionFilterGroup & CollisionGroups.Default) === 0) continue;

		body.shapes.forEach((shape, i) =>
		{
			shapePosition.copy(body.shapeOffsets[i]);
			shapeQuaternion.copy(body.shapeOrientations[i]);
			const base = positions.length / 3;

			if (shape instanceof CANNON.Box)
			{
				const h = shape.halfExtents;
				for (let corner = 0; corner < 8; corner++)
				{
					vertex.set(corner & 1 ? h.x : -h.x, corner & 2 ? h.y : -h.y, corner & 4 ? h.z : -h.z);
					addVertex(vertex, body);
				}
				for (const tri of BOX_TRIANGLES) indices.push(base + tri);
			}
			else if (shape instanceof CANNON.Trimesh)
			{
				const v = shape.vertices;
				for (let j = 0; j < v.length; j += 3)
				{
					vertex.set(v[j] * shape.scale.x, v[j + 1] * shape.scale.y, v[j + 2] * shape.scale.z);
					addVertex(vertex, body);
				}
				for (let j = 0; j < shape.indices.length; j++) indices.push(base + shape.indices[j]);
			}
		});
	}

	return { positions, indices };
}

// Corner index bits: 1 = +x, 2 = +y, 4 = +z. Counter-clockwise seen from outside.
const BOX_TRIANGLES = [
	0, 1, 5, 0, 5, 4,   // -y
	2, 6, 7, 2, 7, 3,   // +y
	0, 4, 6, 0, 6, 2,   // -x
	1, 3, 7, 1, 7, 5,   // +x
	0, 2, 3, 0, 3, 1,   // -z
	4, 5, 7, 4, 7, 6,   // +z
];
