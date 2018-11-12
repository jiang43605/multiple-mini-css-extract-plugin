# Base

[https://github.com/webpack-contrib/mini-css-extract-plugin](https://github.com/webpack-contrib/mini-css-extract-plugin)

## features

- compatible with mini-css-extract-plugin (100% case pass)
- packed into multiple css according to different global less

## dependency

```npm
less-loader
```

## use

```js
 {
    ...
    module: {
        rules: [
            {
                test: /\.less$/,
                use: [
                    {
                        loader: miniCssExtractPlugin.loader,
                        options: {
                            less: [
                                {
                                    filename: 'pccss/[name].[contenthash].css',
                                    globalVars: {},
                                    modifyVars: {
                                        '@primary-color': 'red',
                                        publicPath: publicPath || '/'
                                    }
                                },
                                {
                                    filename: 'phonecss/[name].[contenthash].css',
                                    globalVars: {},
                                    modifyVars: {
                                        '@primary-color': 'green',
                                        publicPath: publicPath || '/'
                                    }
                                }
                            ],

                            // the old way(compatible), in order to take effect, 
                            // you must remove less option 
                            // publicPath: publicPath || '/'
                        }
                    },
                    {
                        loader: 'css-loader'
                    },
                    {
                        loader: 'less-loader'
                    }
                    ...
                ]
            }
        ]
    }

    ...

     new miniCssExtractPlugin({
        // this option does not take effect when you specify 'less' option in loader
        filename: '[name].[contenthash].css',
    })
}
```

then you can see it in the directory:

```txt
pccss
    - index.7d4112a0ee983e1028ba.css
    - vendors.87f0392908854a20e1ff.css
phonecss
    - index.7d4112a0ee983e1028ba.css
    - vendors.87f0392908854a20e1ff.css
```