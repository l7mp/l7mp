{{/*
Common labels
*/}}
{{- define "l7mp-prometheus-helm-v1.labels" -}}
{{ include "l7mp-prometheus-helm-v1.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.selectorLabels.version }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "l7mp-prometheus-helm-v1.selectorLabels" -}}
app.kubernetes.io/component: {{ .Values.selectorLabels.component }}
app.kubernetes.io/name: {{ .Values.selectorLabels.name }}
{{- end }}

