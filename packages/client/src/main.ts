import { World } from './sketchbook';

const world = new World('assets/world.glb');

// Handle for poking at the sandbox from the devtools console
if (import.meta.env.DEV) (window as any).world = world;
