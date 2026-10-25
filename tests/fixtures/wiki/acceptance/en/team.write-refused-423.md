# Write refused on the hosted Studio: span locked (423)

<a name="symptom"></a>

## Symptom

The hosted Studio refuses the save with 423: another member holds the lease on that span.

<a name="recovery"></a>

## Recovery

Wait for the lease to end (120 s), ask the member, or an owner takes it over.
