# Determinism

Two campaigns with the same scenario, seed, commands, and sequence of `advanceSimulation` hour counts end in the same serializable state.

The generator is mulberry32. Its state is an integer on the campaign and is saved. It is used when a computer-controlled country picks an event choice. Combat and movement do not call it.

Organization, supply ratios, political percentages, and production efficiency are rounded to three decimal places so a JSON save restores the same numbers. Manpower, equipment, resources, and construction progress stay integers. The economy does not call the random generator.

`performance.now()` measurements are returned on the simulation report only. They are not stored in the campaign, so a slow machine does not change the result.

Pause drops requested hours. A paused campaign advanced for any hour count is unchanged.

The guarantee is for one JavaScript engine and one build. It is not a promise of identical floats across different engines or compiled targets.
