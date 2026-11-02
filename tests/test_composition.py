from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'sources/gar-tools/composition'))
from product import Product
from package import configure_script, render_service

class ProductComposition(unittest.TestCase):
    def test_real_submodules_and_csv_binding_are_composed(self):
        product=Product(ROOT).validate()
        report=product.describe()
        self.assertEqual({'application','tools','board'},set(report['components']))
        self.assertEqual(5,report['validated']['gpio_lines'])
        self.assertEqual(1,report['validated']['spi_devices'])
        self.assertTrue((product.components['board']/'.git').exists())
        self.assertEqual('scripts/run-face.cjs',report['launch']['entrypoint'])
        for relative in ['scripts/audio.cjs', 'sources/gar-my-friend/tools/audio.cjs',
                         'scripts/live.cjs', 'sources/gar-my-friend/tools/live.cjs',
                         'sources/gar-tools/targets/linux-device/runtime/alsa-audio/duplex.cjs',
                         'sources/gar-tools/web-simulator/components/gemini-live.mjs',
                         'sources/gar-tools/web-simulator/components/audio-pcm.mjs',
                         'sources/gar-tools/targets/linux-device/runtime/alsa-audio/audio.cjs']:
            self.assertIn(relative, product.data['payload'])
            self.assertTrue((ROOT/relative).is_file())
        self.assertNotIn('garmyfriend',configure_script(product).lower())
        self.assertIn(product.id,render_service(product)[0])
        for wrapper in ['build.sh','install.sh']:
            text=(ROOT/'infra'/product.board['id']/wrapper).read_text()
            self.assertNotIn('arm-none-linux-gnueabihf',text)
            self.assertNotIn('systemctl',text)
            self.assertNotIn('start-stop-daemon',text)

if __name__=='__main__': unittest.main()
