FROM nginx:1.27-alpine

COPY pricing-dashboard/ /usr/share/nginx/html/

EXPOSE 80
