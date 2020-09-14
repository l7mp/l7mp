FROM python:3.7
RUN pip install kopf
ADD ./requirements.txt /
RUN pip install -r /requirements.txt
ADD . /src
ENV NAMESPACE default
ENV PEERING operator.l7mp.io
# CMD kopf run --namespace=$NAMESPACE /src/l7mp.py --verbose
CMD kopf run --namespace=$NAMESPACE --peering=$PEERING /src/l7mp.py
