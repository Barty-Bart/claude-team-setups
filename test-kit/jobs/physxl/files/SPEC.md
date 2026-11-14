# Rigid-body physics engine (full version): build spec

Build a complete 2D rigid-body physics engine as a dependency-free JavaScript library, with a demo page, unit tests and documentation.

## Deliverables
- `physics.js`: one file, no dependencies. It works as a Node CommonJS module (`const Physics = require('./physics.js')`) and as a plain browser script (it defines `window.Physics`).
- `tests/`: unit tests for the engine, runnable with `node --test`.
- `README.md`: how to use the library, with the full API and a short note on how the solver works.
- `index.html`: a demo page that loads `physics.js`, draws the world on a canvas and lets the user switch between at least ten scenes (box stack, pyramid, ramp with friction, bouncing balls, 500-body stress test, hanging chain, rope bridge, Newton's cradle, dominoes, moving platforms, sensors and filtering). It draws joints, tints sleeping bodies, and has a debug overlay (contact points, body count, step time). The user can, drop bodies with a click or tap, and pause, resume and single-step. It runs from `file://` with no network requests and works on a phone.

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

### Body options and fields added in the full version
```js
world.addBody({
  ...,
  isKinematic: false,             // kinematic bodies move with their velocity, ignore gravity, forces and collisions, and push dynamic bodies
  isSensor: false,                // sensors detect overlaps (contacts and events) but cause no collision response
  category: 1, mask: 0xFFFF,      // bit fields; A and B collide only if (A.mask & B.category) !== 0 && (B.mask & A.category) !== 0
  linearDamping: 0, angularDamping: 0,   // per second; velocity decays roughly as exp(-damping * t)
  gravityScale: 1,
  canSleep: true,
});
body.sleeping                     // true while the body is asleep
```

### Forces
```js
world.applyForce(body, { x, y }, point);   // force in N at a world-space point (default: centre of mass); applies to the next step only
```

### Joints
```js
const j1 = world.addJoint({ type: 'distance', bodyA, bodyB, anchorA: { x, y }, anchorB: { x, y }, length });
// anchors are in each body's local frame (default: its centre). The joint keeps the two anchor points exactly `length` apart (a rigid rod).
// If length is omitted it is the distance between the anchors when the joint is created.
const j2 = world.addJoint({ type: 'revolute', bodyA, bodyB, anchor: { x, y } });
// a pin at a world-space point at creation time; the bodies rotate freely about it.
// In both joint types bodyB may be null: the joint then attaches bodyA to a fixed point in the world
// (for a distance joint, anchorB is then that world-space point).
world.removeJoint(j1);
world.joints;                     // array of joints
```
Bodies connected by a joint do not collide with each other.

### Queries
```js
world.raycast({ x, y }, { x, y });   // from, to. Returns the closest hit { body, point: { x, y }, normal: { x, y }, fraction } or null. Sensors are ignored.
world.queryAABB({ minX, minY, maxX, maxY });   // array of bodies whose shape overlaps the box
world.queryPoint({ x, y });          // array of bodies whose shape contains the point
```

### Events
```js
world.on('beginContact', (bodyA, bodyB) => {});   // called once when two bodies (or a body and a sensor) start touching
world.on('endContact', (bodyA, bodyB) => {});     // called once when they stop touching
world.off('beginContact', fn);
```

### Save and restore
```js
const data = world.toJSON();                 // plain JSON-serialisable object with the complete state
const copy = Physics.fromJSON(JSON.parse(JSON.stringify(data)));
// copy must continue exactly like the original: stepping both the same way gives identical results.
// Bodies keep their ids. Event listeners are not saved.
```

## Requirements
1. Correct dynamics: gravity, linear and angular motion, impulses, mass and inertia for all three shapes.
2. Collisions between every pair of shapes (circle, box, convex polygon), including rotation, friction and restitution.
3. Stable resting contact: bodies come to rest without jitter, sinking or drifting. A stack of 10 boxes on static ground stays standing; taller stacks and pyramids should too.
4. No tunnelling: a body moving at up to 300 m/s must not pass through a static wall that is at least 0.05 m thick when the world is stepped at 1/60 s.
5. Physically plausible results: momentum and (for perfectly elastic, frictionless contacts) energy are conserved; a block on a slope holds or slides according to its friction; a ball that slides on rough ground ends up rolling.
6. Performance: 500 bodies in contact simulate in real time at 60 steps per second on a laptop.
7. Deterministic: the same sequence of calls always gives exactly the same result.
8. Sleeping: a body that has been at rest for about half a second falls asleep (`body.sleeping === true`) and costs almost nothing to simulate. It wakes when something moving touches it, when a joint partner moves, or when an impulse or force is applied. 2,000 resting bodies must step in well under a millisecond or two.
9. Joints are stiff and stable: a pendulum on a distance joint swings with the right period, a 10-link chain hangs without stretching or exploding.
10. Kinematic bodies carry things: a box standing on a moving kinematic platform rides along with it through friction.
