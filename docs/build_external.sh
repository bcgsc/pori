# Pulls the Python adapter documentation from their respective repositories
# and builds them into the main documentation

# clone the IPR python adapter if it does not exist, otherwise update
if ! [ -d docs/_pori_ipr_python ];
then
    git clone https://github.com/bcgsc/pori_ipr_python.git docs/_pori_ipr_python
else
    cd docs/_pori_ipr_python
    git pull
    cd ../..
fi

# clone the GraphKB Python adapter if it does not exist, otherwise update
if ! [ -d docs/_pori_graphkb_python ];
then
    git clone https://github.com/bcgsc/pori_graphkb_python.git docs/_pori_graphkb_python
else
    cd docs/_pori_graphkb_python
    git pull
    cd ../..
fi

# now build the reference python module API files
markdown_refdocs \
    docs/_pori_graphkb_python/graphkb \
    docs/_pori_ipr_python/ipr  \
    -o docs/developer_reference \
    --link

# build the spec tables
mkdir -p docs/ipr/includes
python docs/ipr_spec_tables.py
