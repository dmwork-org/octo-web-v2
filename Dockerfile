# octo-web · nginx image
#
# CI builds dist/ first, then packages it into a static nginx image.
# The DEPLOY_ENV build arg selects deploy/nginx/default_<env>.conf.

FROM hub.intra.mlamp.cn/miaozhen-frontend/nginx:alpine as production-stage

ARG DEPLOY_ENV="test"

COPY /deploy/nginx/default_${DEPLOY_ENV}.conf /etc/nginx/conf.d/default.conf
ADD ./dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
