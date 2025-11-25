# Subgraphs

Introduced with the GraphKB API [v3.16.0](https://github.com/bcgsc/pori_graphkb_api/releases/tag/v3.16.0) release, the new `/subgraphs` API route traverses an ontology graph and returns a subgraph of all traversed nodes and edges (see the [specifications](https://graphkb-api.bcgsc.ca/api/spec#section/Subgraphs) for usage examples).

It aims to overcome two limitations of the fixed subqueries, such as the `similarTo` query previously described in the [Ontology Algorithm](../) and [Gene Example](./gene.md) sections:

1. #### A graph traversal that is *potentially incomplete*
   After resolving aliases for the second and final time, any remaining inheritance-like edges are left untraversed. This is particularly a problem when, for a given ontology, many sources and versions are referencing each other (e.g. [OncoTree](../loading_data.md#oncotree), [NCIt](../loading_data.md#ncit) and [Disease Ontology](../loading_data.md#disease-ontology) for Diseases).

2. #### Results that are *challenging to interpret*
   Since only vertices are returned, one can only wonder which edges were traversed during graph traversal.

### Thorough graph traversal

By leveraging OrientDB's graph traversal engine, the subgraphs route ensures that all relevant vertices are reached (subject to the depth limit, which defaults to 100 but can be overridden).

### Results returned as a subgraph

Both vertices and edges are returned, alongside an adjacency list. Since the returned subgraph can be disconnected (this can ossure if the base records of the traversal were disconnected in the first place), a list of the different components is also returned.

### Virtualization

A simplified 'virtual' version of the traversed graph can also be returned, where each group of similar nodes (nodes linked together by similarity edges) is collapsed into a single virtual node, and hierarchical edges are collapsed into virtual edges and redirected from and to the corresponding virtual nodes. This functionality, when coupled with a graph visualization tool, greatly simplifies graph traversal interpretation.
