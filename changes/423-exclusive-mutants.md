### Changes

- **The exclusive lease's runner is under mutation testing (4.2.3)**: `studio-auth`'s tests now pin how a member's long
  operation takes the project's lease, gives it back and renews it (19 mutants that survived before are killed).
