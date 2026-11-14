# Rigid-body physics engine: build spec

Build a small 2D rigid-body physics engine as a dependency-free JavaScript library, plus a demo page.

## Deliverables
- `physics.js`: one file, no dependencies. It works as a Node CommonJS module (`const Physics = require('./physics.js')`) and as a plain browser script (it defines `window.Physics`).
- `index.html`: a demo page that loads `physics.js`, draws the world on a canvas and lets the user switch between scenes (box stack, pyramid, ramp with friction, bouncing balls, 500-body stress test), drop bodies with a click or tap, and pause, resume and single-step. It runs from `file://` with no network requests and works on a phone.

## Conventions
Units are metres, kilograms, seconds and radians. +y is up. Positive angles and angular velocities are counter-clockwise.

## API (required, our test rig depends on it)
```js
const world = Physics.createWorld({ gravity: { x: 0, y: -9.81 } });  // gravity defaults to the value shown

const body = world.addBody({
  shape: 'circle' | 'box' | 'polygon',
  radius: 0.5,                    // circle
  width: 1, height: 1,            // box
  vertices: [{ x, y }, ...],      // polygon: convex, counter-clockwise, relative to its centre of mass
  x: 0, y: 0, angle: 0,           // initial pose of the centre of mass (defaults 0)
  vx: 0, vy: 0, omega: 0,         // initial linear and angular velocity (defaults 0)
  density: 1,                     // kg per square metre; mass and moment of inertia follow from shape and density
  friction: 0.5,                  // Coulomb friction coefficient
  restitution: 0,                 // bounciness, 0 to 1
  isStatic: false,                // static bodies never move
});

body.id                           // unique number
body.x, body.y, body.angle        // current pose
body.vx, body.vy, body.omega      // current velocity
body.mass, body.inertia           // derived from shape and density

world.step(dt);                   // advance the simulation by dt seconds (the rig calls step(1/60) repeatedly)
world.bodies;                     // array of all bodies in the world
world.removeBody(body);
world.applyImpulse(body, { x, y }, point);   // impulse in N·s at a world-space point; point defaults to the centre of mass
world.getContacts();              // contacts found in the last step: [{ a: bodyId, b: bodyId, point: { x, y }, normal: { x, y }, depth }]
```
For a pair of touching bodies the friction coefficient is `sqrt(frictionA * frictionB)` and the restitution is `max(restitutionA, restitutionB)`.

## Requirements
1. Correct dynamics: gravity, linear and angular motion, impulses, mass and inertia for all three shapes.
2. Collisions between every pair of shapes (circle, box, convex polygon), including rotation, friction and restitution.
3. Stable resting contact: bodies come to rest without jitter, sinking or drifting. A stack of 10 boxes on static ground stays standing; taller stacks and pyramids should too.
4. No tunnelling: a body moving at up to 300 m/s must not pass through a static wall that is at least 0.05 m thick when the world is stepped at 1/60 s.
5. Physically plausible results: momentum and (for perfectly elastic, frictionless contacts) energy are conserved; a block on a slope holds or slides according to its friction; a ball that slides on rough ground ends up rolling.
6. Performance: 500 bodies in contact simulate in real time at 60 steps per second on a laptop.
7. Deterministic: the same sequence of calls always gives exactly the same result.
