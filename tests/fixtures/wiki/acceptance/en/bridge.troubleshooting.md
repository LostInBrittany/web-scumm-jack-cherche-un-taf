# Bridge and connector troubleshooting

<a name="conflict-409"></a>

## The Bridge answers 409

The Bridge answers with the error 409 when a signal with the same id was already recorded: the duplicate is ignored.

<a name="unavailable-503"></a>

## The Bridge answers 503

The Bridge answers with the error 503 when its store is unavailable: the connector retries later.
