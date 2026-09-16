
node() {
    try {
        String ANSI_GREEN = "\u001B[32m"
        String ANSI_NORMAL = "\u001B[0m"
        String ANSI_BOLD = "\u001B[1m"
        String ANSI_RED = "\u001B[31m"
        String ANSI_YELLOW = "\u001B[33m"

        ansiColor('xterm') {
            stage('Checkout') {
                cleanWs()
                checkout scm
                commit_hash = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                env.commit_id = sh(script: "echo " + "uiproxy" + "_" + commit_hash + "_" + env.BUILD_NUMBER, returnStdout: true).trim()
                echo "${env.commit_id}"

                }
        }
            stage('docker-pre-Build') {
              sh '''
              cd $docker_file_path
              pwd
              docker build -f ./Dockerfile.build -t $docker_pre_build .
              docker run --name=$docker_pre_build $docker_pre_build && docker cp $docker_pre_build:/usr/src/app/dist.zip .
              sleep 30
              docker rm -f $docker_pre_build
              docker rmi -f $docker_pre_build
              unzip dist.zip              
                '''
        }
      
            // SonarQube analysis — ADDITIVE and read-only.
            //
            // It observes the source only: it does not build, package, or push
            // the image, and it runs AFTER the artifact already exists so it can
            // never change what gets deployed.
            //
            // It does NOT run the test suite. The only suites in this repo are
            // live integration tests that make real network calls to a deployed
            // environment (one POSTs an assessment payload), so running them in
            // CI would write data to a live system.
            //
            // Failures are swallowed on purpose while this rolls out: analysis
            // problems must not break the existing deploy pipeline. Remove the
            // catch once it has run cleanly a few times.
            //
            // Jenkins-side prerequisites (configured on the server, not here):
            //   - Manage Jenkins > System > SonarQube servers: an entry named
            //     'sonarqube' with its URL and token credential
            //   - Global Tool Configuration: a SonarScanner install named
            //     'sonar_scanner'
            //   - optional: a Sonar webhook back to Jenkins so the Quality Gate
            //     stage returns promptly instead of polling until timeout
            stage('SonarQube Analysis') {
                try {
                    def scannerHome = tool 'sonar_scanner'
                    // Exported via withEnv so the sh block can stay single-quoted
                    // (no Groovy interpolation) and $docker_file_path is still
                    // resolved by the shell rather than by Jenkins.
                    withEnv(["SCANNER_HOME=${scannerHome}"]) {
                        withSonarQubeEnv('sonarqube') {
                            sh '''
                               cd $docker_file_path
                               pwd
                               "$SCANNER_HOME/bin/sonar-scanner"
                               '''
                        }
                    }
                } catch (err) {
                    echo "SonarQube analysis skipped or failed (non-blocking): ${err}"
                }
            }

            // Quality Gate — report-only for now.
            //
            // abortPipeline: false means a gate failure is REPORTED but does not
            // fail the build. Flip to true once the team is ready to enforce it;
            // Clean-as-You-Code means only new/changed code is judged, so a low
            // legacy baseline will not block anything.
            stage('Quality Gate') {
                try {
                    timeout(time: 10, unit: 'MINUTES') {
                        def qg = waitForQualityGate abortPipeline: false
                        echo "SonarQube quality gate status: ${qg.status}"
                    }
                } catch (err) {
                    echo "Quality gate check skipped or timed out (non-blocking): ${err}"
                }
            }

            stage('docker-build') {
                sh '''
                   cd $docker_file_path
                   pwd
                   docker build -f Dockerfile -t $docker_server/$docker_repo:$commit_id .
                   '''
        }

         stage('docker-push') {

               sh '''
                  pwd
                  docker push $docker_server/$docker_repo:$commit_id
                  docker rmi -f $docker_server/$docker_repo:$commit_id
                  rm -rf dist
                  rm -rf dist.zip

                  '''

                    }
              stage('ArchiveArtifacts') {
	       	   sh ("echo ${commit_id} > commit_id.txt")	     
                    archiveArtifacts "commit_id.txt" 
                    currentBuild.description = "${commit_id}"
        }

                 }
    catch (err) {
        currentBuild.result = "FAILURE"
        throw err
    }

}
 
