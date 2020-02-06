FROM python:3-alpine
COPY requirements.txt /
RUN pip install -r requirements.txt
EXPOSE 8081/tcp
COPY *.py /
COPY util /util
CMD ["python", "./operator_psvc.py"]
