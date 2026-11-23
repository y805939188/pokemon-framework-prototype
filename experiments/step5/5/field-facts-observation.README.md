# FieldMoveHost coherent native facts

`createFieldFactsObservation(root, nodeUtil.types.isProxy, slots)` issues the opaque
capability used by `FieldMoveHostPorts.factsObservation`. The production caller
must pass the real Node capability. The capability belongs to exactly that root;
copying its public object does not copy its authority.

Every fact provider is a synchronous read. Declare all mutable backing data of a
custom provider with `FieldFactDataSlot` entries. A slot contains an actual owner
object and a path of own data properties; an empty path captures that owner's
data tree. A provider with mutable hidden state that cannot be declared must
return `unavailable`. Functions and accessor properties are not data cells.

The observer captures native map/player/scene identities, native character data
and method descriptors, event sources and page dependencies, relevant tiles and
flags, native page-condition stores, Content map metadata, provider identities,
and declared backing data. The aggregate closes after each single provider/read
segment and once before returning. Closing performs only descriptor/data reads;
it invokes no provider, getter or Proxy trap. A changed read set refuses the
entire aggregate. Providers are not repeated or alternated to seek agreement.

Missing, copied, reentrant or wrong-root capabilities refuse facts explicitly.
Execution remains owned by the actual App operation; this capability cannot
admit an operation, change state, draw RNG, or grant a busy exemption.

`test-field-facts-observation.cjs` uses the actual App query, strict private
plugin emit, and pinned native MZ object methods. It covers the original Cut
cross-provider counterexample, stable Cut/Surf/Flash positives, native/backing
cell changes, a change-before-later-restore counterexample, unsafe native values,
reentry, zero query writes/RNG, and normal once-only Cut execution. Existing host
and App suites retain their business assertions. Actual MZ composition must
issue this capability and put resource/vehicle checks inside the same boundary;
this leaf does not by itself wire menu, keyboard or Surf movement hooks.
