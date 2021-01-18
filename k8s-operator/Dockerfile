FROM python:3.7
RUN pip install kopf
ADD ./requirements.txt /
RUN pip install -r /requirements.txt
ADD . /src
ENV NAMESPACE default
ENV PEERING operator.l7mp.io
ENV KOPF_ARGS ""
CMD kopf run --namespace=$NAMESPACE --peering=$PEERING $KOPF_ARGS /src/l7mp.py
