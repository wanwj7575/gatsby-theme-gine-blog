const fs = require('fs')
const Notabase = require("notabase")
const { parseImageUrl } = require("notabase/src/utils")
const download = require('image-downloader')

const getConfigFromNotion = async (url) => {
    let nb = new Notabase()

    let siteConfig = {}
    const config = await nb.fetch(url)
    await Promise.all(config.rows.map(async item => {
        // proxy cant work 
        // const { Name, Type, Value, Image } = item
        switch (item.Type) {
            case 'text':
                siteConfig[item.Name] = item.Value
                break
            case 'number':
                siteConfig[item.Name] = parseInt(item.Value)
                break
            case 'bool':
                siteConfig[item.Name] = Boolean(item.Value) && item.Value === "1"
                break
            case 'image':
                if (item.Image) {
                    // console.log(item.Image)
                    let options = {
                        url: parseImageUrl(item.Image[0]),
                    }
                    let path
                    if (item.Name === "avatar") {
                        path = `src/static/avatar.jpg`
                    } else if (item.Name === "icon") {
                        path = `src/static/favicon.ico`
                    }
                    options.dest = require.resolve(`./${path}`)
                    await download.image(options)
                    siteConfig[item.Name] = path
                }
                break
        }
    }))
    return siteConfig

}


exports.sourceNodes = async ({ actions, createNodeId, createContentDigest }, options) => {
    const { createNode } = actions;
    const { configTable, ...rawOptions } = options

    let siteConfig = {}
    if (configTable) {
        siteConfig = await getConfigFromNotion(configTable)
    }
    siteConfig = { ...siteConfig, ...rawOptions }


    // create site config node
    const nodeContent = JSON.stringify(siteConfig)
    const nodeMeta = {
        id: createNodeId(nodeContent),
        parent: null,
        children: [],
        internal: {
            type: `SiteConfig`,
            mediaType: `text/html`,
            content: nodeContent,
            contentDigest: createContentDigest(siteConfig)
        }
    }

    const node = Object.assign({}, siteConfig, nodeMeta)
    createNode(node)
}


// exports.onCreateNode = ({ node, getNode, actions }) => {
//     const { createNodeField } = actions
// }

exports.createPages = ({ graphql, actions }) => {

    // // google adsense ??????
    // if (config.google_ad_client.open) {
    //     const ad_txt = `google.com, ${config.google_ad_client.clientId}, DIRECT, f08c47fec0942fa0`
    //     fs.writeFile('public/ads.txt', ad_txt, function (err) {
    //         if (err) {
    //             console.error(err)
    //         }
    //     })
    // }
    // // netlify ???????????????
    // if (config.seo.open) {
    //     // ???????????????????????? netlify?????????????????????????????????seo??????
    //     const _redirects = `${config.seo.netlifyUrl}/* ${config.seo.siteUrl}/:splat 301!`
    //     fs.writeFile('public/_redirects', _redirects, function (err) {
    //         if (err) {
    //             console.error(err)
    //         }
    //     })
    // }

    // **Note:** The graphql function call returns a Promise
    // see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise for more info
    const { createPage } = actions

    return graphql(`
    {
      siteConfig {
        pageSize
        netlifyUrl
        siteUrl
      }
      allPosts(filter: {status: {eq: "published"}}) {
        totalCount
        edges {
          node {
              id
              slug
              tags
          }
        }
      }
    }`).then(result => {

        console.log(result)
        const { pageSize, netlifyUrl, siteUrl } = result.data.siteConfig

        // ????????? netlify??????????????????????????? SEO ??????
        const _redirects = `${netlifyUrl}/* ${siteUrl}/:splat 301!`
        fs.writeFile('public/_redirects', _redirects, function (err) {
            if (err) {
                console.error(err)
            }
        })

        // ????????????
        createPage({
            path: `/`,
            component: require.resolve(`./src/components/post/post-page.js`),
            context: {
                skip: 0,
                limit: pageSize,
                currentPage: 1,
            },
        })

        // ????????????
        const { totalCount, edges } = result.data.allPosts
        const pageCount = Math.ceil(totalCount / pageSize)
        for (let i = 1; i <= pageCount; i++) {
            createPage({
                path: `page/${i}`,
                component: require.resolve(`./src/components/post/post-page.js`),
                context: {
                    skip: (i - 1) * pageSize,
                    limit: pageSize,
                    currentPage: i,
                },
            })
        }

        // ?????????????????????
        edges.forEach(({ node }) => {
            createPage({
                path: `posts/${node.slug}`,
                component: require.resolve(`./src/components/post/blog-post.js`),
                context: {
                    // Data passed to context is available
                    // in page queries as GraphQL variables.
                    slug: node.slug,
                },
            })
        })
        // ??????tag?????????

        let allTags = new Set()
        edges.forEach(({ node }) => {
            node.tags && node.tags instanceof Array && node.tags.map(tag => tag && allTags.add(tag))
        })

        Array.from(allTags).map(tag => {
            createPage({
                path: `tags/${tag}`,
                component: require.resolve(`./src/components/postTag/tag-page.js`),
                context: {
                    tag: tag,
                },
            })
        })
    })
}


// fix antv build error
exports.onCreateWebpackConfig = ({ stage, loaders, actions }) => {
    if (stage === "build-html") {
        actions.setWebpackConfig({
            module: {
                rules: [
                    {
                        test: /@antv/,
                        use: loaders.null(),
                    },
                ],
            },
        })
    }
}