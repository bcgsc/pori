# About GraphKB

GraphKB is a graph-based implementation of a cancer knowledge base. GraphKB is unique among other knowledge base projects in its inclusion of ontology relations and subsquent real-time leveraging of their inherent graph structure.

## Getting Started

### Users

The simplest way to try out GraphKB is via the demo we provide [here](https://pori-demo.bcgsc.ca/).
simply click on the `/graphkb` link and enter the provided credentials (`graphkb_admin`/`graphkb_admin`).
This will allow you to test out the application before having to set up your own instance. If your
institution would like to host an instance of GraphKB please see the instuctions for developers and
system administrators in the next section.

### Developers / Sys-Admins

GraphKB can be installed/setup by itself or in combination with the PORI reporting application, IPR.
To see instructions for setup of the complete platform please see the [main install page](../install.md).

#### Loading Data

When you setup/install GraphKB you will create a new and empty database. Most users will then
want to load some standard content into their newly created instance. We have created scripts and
modules to simplify this process. See the [data loading page](./loading_data.md) for more information.

## Using the Python Adaptor

The python adaptor to GraphKB is provided for users who would like to incorporate an instance of
GraphKB into their own scripts and pipelines. Additionally it is used by the IPR python adaptor to
connect to GraphKB.
