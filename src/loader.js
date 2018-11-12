const NativeModule = require('module');
const fs = require('fs'); // eslint-disable-line
const loaderUtils = require('loader-utils');
const NodeTemplatePlugin = require('webpack/lib/node/NodeTemplatePlugin');
const NodeTargetPlugin = require('webpack/lib/node/NodeTargetPlugin');
const LibraryTemplatePlugin = require('webpack/lib/LibraryTemplatePlugin');
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');
const LimitChunkCountPlugin = require('webpack/lib/optimize/LimitChunkCountPlugin');

const MODULE_TYPE = 'css/mini-extract';
const pluginName = 'mini-css-extract-plugin';

const exec = (loaderContext, code, filename) => {
  const module = new NativeModule(filename, loaderContext);
  module.paths = NativeModule._nodeModulePaths(loaderContext.context); // eslint-disable-line no-underscore-dangle
  module.filename = filename;
  module._compile(code, filename); // eslint-disable-line no-underscore-dangle
  return module.exports;
};

const findModuleById = (modules, id) => {
  for (const module of modules) {
    if (module.id === id) {
      return module;
    }
  }
  return null;
};

function normalOptions(oldQuery) {
  const query = { ...oldQuery };

  if (query.less === undefined) {
    // 如果这个属性不存在，进入普通模式
    const originOptions = this[`${MODULE_TYPE}_options`];
    query._setLessLoader = false; // eslint-disable-line
    query.less = [
      {
        filename: originOptions.filename,
        publicPath: query.publicPath,
      },
    ];
  } else {
    query._setLessLoader = true; // eslint-disable-line
  }

  if (Array.isArray(query.less)) return query;
  if (typeof query.less !== 'string')
    throw new Error(`${pluginName} option(less) must be array or string!`);

  const options = fs.readFileSync(query.less, { encoding: 'utf-8' });
  query.less = JSON.parse(options);

  return query;
}

function makeChildCompiler(
  index,
  request,
  option,
  isHandleLess,
  childCallBack
) {
  const childFilename = `*${index}`; // eslint-disable-line no-path-concat
  const loaders = this.loaders.slice(this.loaderIndex + 1);
  const publicPath =
    typeof option.publicPath === 'string'
      ? option.publicPath // eslint-disable-line
      : this._compilation.outputOptions.publicPath;
  const outputOptions = {
    filename: childFilename,
    publicPath,
  };
  const childCompiler = this._compilation.createChildCompiler(
    `${pluginName} ${request} ${option.filename}`,
    outputOptions
  );
  new NodeTemplatePlugin(outputOptions).apply(childCompiler);
  new LibraryTemplatePlugin(null, 'commonjs2').apply(childCompiler);
  new NodeTargetPlugin().apply(childCompiler);
  new SingleEntryPlugin(this.context, `!!${request}`, pluginName).apply(
    childCompiler
  );
  new LimitChunkCountPlugin({ maxChunks: 1 }).apply(childCompiler);
  // We set loaderContext[MODULE_TYPE] = false to indicate we already in
  // a child compiler so we don't spawn another child compilers from there.
  childCompiler.hooks.thisCompilation.tap(
    `${pluginName} loader`,
    (compilation) => {
      compilation.hooks.normalModuleLoader.tap(
        `${pluginName} loader`,
        (loaderContext, module) => {
          loaderContext.emitFile = this.emitFile; // eslint-disable-line
          loaderContext[MODULE_TYPE] = false; // eslint-disable-line no-param-reassign

          if (module.request === request) {
            // eslint-disable-next-line no-param-reassign
            module.loaders = loaders.map((loader) => {
              let ops;
              if (
                isHandleLess === true &&
                loader.path.includes('less-loader')
              ) {
                let { globalVars, modifyVars } = loader.options || {};

                globalVars = Object.assign(
                  {},
                  globalVars || {},
                  option.globalVars
                );
                modifyVars = Object.assign(
                  {},
                  modifyVars || {},
                  option.modifyVars
                );
                ops = Object.assign({}, loader.options, {
                  globalVars,
                  modifyVars,
                });
              } else {
                ops = loader.options;
              }

              return {
                loader: loader.path,
                options: ops,
                ident: loader.ident,
              };
            });
          }
        }
      );
    }
  );

  let source;
  childCompiler.hooks.afterCompile.tap(pluginName, (compilation) => {
    source =
      compilation.assets[childFilename] &&
      compilation.assets[childFilename].source();

    // Remove all chunk assets
    compilation.chunks.forEach((chunk) => {
      chunk.files.forEach((file) => {
        delete compilation.assets[file]; // eslint-disable-line no-param-reassign
      });
    });
  });

  childCompiler.runAsChild((err, entries, compilation) => {
    if (err) return childCallBack(err);

    if (compilation.errors.length > 0) {
      return childCallBack(compilation.errors[0]);
    }
    compilation.fileDependencies.forEach((dep) => {
      this.addDependency(dep);
    }, this);
    compilation.contextDependencies.forEach((dep) => {
      this.addContextDependency(dep);
    }, this);
    if (!source) {
      return childCallBack(
        new Error("Didn't get a result from child compiler")
      );
    }
    let text;
    let locals;
    try {
      text = exec(this, source, request);
      locals = text && text.locals;
      if (!Array.isArray(text)) {
        text = [[null, text]];
      } else {
        text = text.map((line) => {
          const module = findModuleById(compilation.modules, line[0]);
          return {
            identifier: module.identifier(),
            content: line[1],
            media: line[2],
            sourceMap: line[3],
          };
        });
      }
      this[MODULE_TYPE](text, option.filename);
    } catch (e) {
      return childCallBack(e);
    }

    // 这个地方不用更改（和css模块化有关），因为生成多个css文件并不会增加或修改locals的内容
    // 因此每次生成的内容和上次应当是一模一样的，可以重新覆盖
    let resultSource = `// extracted by ${pluginName}`;
    if (locals && typeof resultSource !== 'undefined') {
      resultSource = `\nmodule.exports = ${JSON.stringify(locals)};`;
    }

    return childCallBack(null, resultSource);
  });
}

function pitch(request) {
  const query = loaderUtils.getOptions(this) || {};
  const cssModuleTypes = normalOptions.call(this, query);
  const asyncCallBack = this.async();
  let callBackNum = cssModuleTypes.less.length;
  this.addDependency(this.resourcePath);

  const callBack = (e, result) => { // eslint-disable-line
    callBackNum--; // eslint-disable-line

    if (e) {
      asyncCallBack(e);
      throw e;
    }

    if (callBackNum === 0) {
      return asyncCallBack(null, result);
    }
  };

  cssModuleTypes.less.forEach((option, index) =>
    makeChildCompiler.call(
      this,
      index,
      request,
      option,
      cssModuleTypes._setLessLoader, // eslint-disable-line
      callBack
    )
  );
}

module.exports = function() {}; // eslint-disable-line
module.exports.pitch = pitch;
