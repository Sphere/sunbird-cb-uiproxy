import del from 'del'
import gulp from 'gulp'
import gulpTypeScript from 'gulp-typescript'

import { Gulpclass, SequenceTask, Task } from 'gulpclass'

const project = gulpTypeScript.createProject('tsconfig.json')
const dist = './dist'

@Gulpclass()
export class Gulpfile {
  // The Sonar scan task used to live here with a hardcoded server URL and
  // analysis token. It has moved to scripts/sonar-scan.sh (npm run sonar:local),
  // which reads credentials from the environment instead of the repository.
  @Task('del-dist')
  clean() {
    return del('./dist/**')
  }

  @Task('compile-project')
  compileProject() {
    // Unit tests are co-located next to their source (foo.ts + foo.test.ts).
    // They must never reach dist/, so they are negated here as well as in
    // tsconfig "exclude". Verify with:
    //   npm run build && find dist -name '*.test.js'   -> must be empty
    const tsResult = gulp
      .src([
        'src/**/*.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts',
        // Test-only helpers. They live under src/ so tests can import them
        // relatively, but they import supertest (a devDependency) and must
        // never be shipped.
        '!src/test-support/**',
      ])
      .pipe(project())
    return tsResult.js.pipe(gulp.dest(dist))
  }

  @Task('copy-package')
  copyPackageJson() {
    return gulp.src('./package.json').pipe(gulp.dest(dist))
  }

  @Task('copy-json')
  copyJson() {
    return gulp.src('src/**/*.json').pipe(gulp.dest(dist))
  }

  @Task('copy-assets')
  copyAssets() {
    return gulp.src('src/assets/**/*').pipe(gulp.dest(`${dist}/assets`))
  }

  @SequenceTask('build')
  build() {
    return [
      'del-dist',
      'compile-project',
      'copy-package',
      'copy-json',
      'copy-assets',
    ]
  }
}
