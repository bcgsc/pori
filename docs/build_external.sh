# Pulls the Python adaptor documentation from their respective repositories
# and builds them into the main documentation

# clone the IPR python adaptor if it does not exist, otherwise update
if ! [ -d docs/_pori_ipr_python ];
then
    git clone https://github.com/bcgsc/pori_ipr_python.git docs/_pori_ipr_python
else
    cd docs/_pori_ipr_python
    git pull
    cd ../..
fi

# clone the GraphKB Python adaptor if it does not exist, otherwise update
if ! [ -d docs/_pori_graphkb_python ];
then
    git clone https://github.com/bcgsc/pori_graphkb_python.git docs/_pori_graphkb_python
else
    cd docs/_pori_graphkb_python
    git pull
    cd ../..
fi

# copy docs for IPR python
mkdir -p docs/ipr/python_adaptor
cp -r docs/_pori_ipr_python/docs/* docs/ipr/python_adaptor

# copy docs for IPR python
mkdir -p docs/graphkb/python_adaptor
cp -r docs/_pori_graphkb_python/docs/* docs/graphkb/python_adaptor

# now build the reference python module API files
markdown_refdocs \
    docs/_pori_graphkb_python/graphkb \
    docs/_pori_ipr_python/ipr  \
    -o docs/developer_reference \
    --link
