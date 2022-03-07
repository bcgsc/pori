# Pulls the Python adapter documentation from their respective repositories
# and builds them into the main documentation

# clone the IPR python adapter if it does not exist, otherwise update
if ! [ -d docs/_pori_ipr_python ];
then
    git clone https://github.com/bcgsc/pori_ipr_python.git docs/_pori_ipr_python
    echo "hide: true" > docs/_pori_ipr_python/.pages
else
    cd docs/_pori_ipr_python
    git checkout master
    git pull
    cd ../..
fi

# clone the GraphKB Python adapter if it does not exist, otherwise update
if ! [ -d docs/_pori_graphkb_python ];
then
    git clone https://github.com/bcgsc/pori_graphkb_python.git docs/_pori_graphkb_python
    echo "hide: true" > docs/_pori_graphkb_python/.pages
else
    cd docs/_pori_graphkb_python
    git checkout master
    git pull
    cd ../..
fi


# clone the loaders repo if it does not exist, otherwise update
if ! [ -d docs/graphkb/_pori_graphkb_loader ];
then
    git clone https://github.com/bcgsc/pori_graphkb_loader.git docs/graphkb/_pori_graphkb_loader
    echo "hide: true" > docs/graphkb/_pori_graphkb_loader/.pages
else
    cd docs/graphkb/_pori_graphkb_loader
    git checkout master
    git pull
    cd ../../..
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
