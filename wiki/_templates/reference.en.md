<!--
Template: reference, docs/dev/PLAN-4.5-WIKI.md Annex B. One section per identifier (a command, a field, a variable, a
route), each with its own section id, the identifier in lowercase kebab case; its sub-headings carry no id. List the identifiers in the manifest's
`identifiers` too. The version an identifier appeared in goes in an HTML comment on the line right after its anchor,
`applies: .. since 4.5.0` as below (its `featureSince`; a range before `since` narrows the versions it is true for).
Copy it to wiki/en/<id>.md (French twin in wiki/fr/), delete these comments.
-->

# Environment variables

<a name="example-identifier"></a>
<!-- applies: .. since 4.5.0 -->

## `EXAMPLE_IDENTIFIER`

### Form

How it is written: its type, its syntax.

### Values and default

The accepted values, and the value when it is absent.

### Constraints

What is refused, and the message.

### Minimal example

```sh
# in the created project
EXAMPLE_IDENTIFIER=value npm run build
```

### Behaviour on an unknown field

Refused, ignored or kept: say which.

### Since

The version the feature appeared in (`featureSince`).

> [!LIMIT id=example-limit]
> Where this identifier does not apply.

<a name="related"></a>

## Related identifiers

- The identifiers read with this one.
