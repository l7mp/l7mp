FROM python:3.7
RUN pip install kopf
ADD ./requirements.txt /
RUN pip install -r /requirements.txt
ADD . /src
ENV NAMESPACE default
# CMD kopf run --namespace=$NAMESPACE /src/l7mp.py --verbose
CMD kopf run --namespace=$NAMESPACE /src/l7mp.py
